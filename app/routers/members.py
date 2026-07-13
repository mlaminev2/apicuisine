from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, delete, select, update
from app.db import get_session
from app.models import (
    Dish,
    Household,
    IngredientMap,
    Member,
    PlanEntry,
    PushSubscription,
    Settings,
    ShoppingCategory,
    ShoppingList,
)
from app.auth import (
    get_current_admin,
    get_current_household,
    get_current_member,
    get_current_owner,
    import_quota_state,
    is_super_admin,
    member_has_premium,
    verify_password,
)
from app.config import settings as app_config
from app.schemas import AccessRead, AccountDeleteRequest, MemberPremiumUpdate, MemberRead

router = APIRouter(prefix="/api", tags=["members"])


@router.get("/members", response_model=list[MemberRead])
def list_members(
    household: Household = Depends(get_current_household),
    session: Session = Depends(get_session),
):
    return session.exec(select(Member).where(Member.household_id == household.id)).all()


@router.get("/access", response_model=AccessRead)
def my_access(
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    """Droits du membre courant : freemium actif ? premium ? quota d'imports ?"""
    from app.models import Settings as HouseholdSettings
    sett = session.get(HouseholdSettings, member.household_id)
    unlimited, remaining = import_quota_state(member, session)
    return AccessRead(
        freemium_enabled=getattr(sett, "freemium_enabled", False) if sett else False,
        is_owner=member.is_owner,
        is_premium=getattr(member, "is_premium", False),
        premium_active=member_has_premium(member, session),
        is_admin=is_super_admin(member),
        # Sans pub pour les comptes premium payés et le super admin — pas pour
        # « freemium désactivé » (qui ne veut pas dire compte payant).
        hide_ads=is_super_admin(member) or getattr(member, "is_premium", False),
        can_manage_billing=bool(getattr(member, "stripe_customer_id", None)),
        reminder_enabled=getattr(member, "reminder_enabled", False),
        import_limit=None if unlimited else app_config.import_free_limit,
        imports_remaining=None if unlimited else remaining,
    )


@router.put("/members/{member_id}/premium", response_model=MemberRead)
def set_member_premium(
    member_id: int,
    body: MemberPremiumUpdate,
    owner: Member = Depends(get_current_admin),
    session: Session = Depends(get_session),
):
    """Accorde ou retire l'autorisation premium d'un membre (super admin)."""
    target = session.get(Member, member_id)
    if not target or target.household_id != owner.household_id:
        raise HTTPException(status_code=404, detail="Membre introuvable")
    if target.is_owner:
        raise HTTPException(status_code=400, detail="Le propriétaire a déjà tous les accès")
    target.is_premium = body.is_premium
    target.premium_source = "admin" if body.is_premium else None
    session.add(target)
    session.commit()
    session.refresh(target)
    return target


@router.delete("/members/{member_id}", status_code=204)
def delete_member(
    member_id: int,
    owner: Member = Depends(get_current_owner),
    session: Session = Depends(get_session),
):
    target = session.get(Member, member_id)
    if not target or target.household_id != owner.household_id:
        raise HTTPException(status_code=404, detail="Membre introuvable")
    if target.is_owner:
        raise HTTPException(status_code=400, detail="Impossible de supprimer le propriétaire du foyer")
    session.exec(update(PlanEntry).where(PlanEntry.planned_by == member_id).values(planned_by=None))
    session.exec(update(PlanEntry).where(PlanEntry.cooked_by == member_id).values(cooked_by=None))
    # Supprime ses abonnements aux notifications pour ne pas laisser d'orphelins.
    session.exec(delete(PushSubscription).where(PushSubscription.member_id == member_id))
    session.delete(target)
    session.commit()


@router.post("/me/delete", status_code=204)
def delete_my_account(
    body: AccountDeleteRequest,
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    """Suppression de compte en libre-service (RGPD).

    - Membre simple : quitte le foyer (son compte est supprimé).
    - Propriétaire avec d'autres membres : la propriété est transférée au plus
      ancien membre restant, puis le compte est supprimé.
    - Propriétaire seul : le foyer et TOUTES ses données sont supprimés.
    """
    if is_super_admin(member):
        raise HTTPException(status_code=403, detail="Le compte administrateur ne peut pas être supprimé ici.")
    # Vérification du mot de passe pour les comptes email (les comptes Google
    # n'en ont pas : la session authentifiée suffit).
    if member.password_hash and not verify_password(body.password, member.password_hash):
        raise HTTPException(status_code=400, detail="Mot de passe incorrect.")

    hh_id = member.household_id
    others = session.exec(
        select(Member).where(Member.household_id == hh_id, Member.id != member.id)
    ).all()

    # Détache ses références et supprime ses abonnements aux notifications.
    session.exec(update(PlanEntry).where(PlanEntry.planned_by == member.id).values(planned_by=None))
    session.exec(update(PlanEntry).where(PlanEntry.cooked_by == member.id).values(cooked_by=None))
    session.exec(delete(PushSubscription).where(PushSubscription.member_id == member.id))

    if member.is_owner and not others:
        # Dernier membre du foyer → on supprime le foyer et toutes ses données.
        for model in (PlanEntry, ShoppingList, IngredientMap, ShoppingCategory, Dish, PushSubscription, Member):
            session.exec(delete(model).where(model.household_id == hh_id))
        sett = session.get(Settings, hh_id)
        if sett:
            session.delete(sett)
        household = session.get(Household, hh_id)
        if household:
            session.delete(household)
    else:
        if member.is_owner:
            # Transfert de la propriété au membre le plus ancien restant.
            heir = min(others, key=lambda m: m.id)
            heir.is_owner = True
            session.add(heir)
        session.delete(member)
    session.commit()
