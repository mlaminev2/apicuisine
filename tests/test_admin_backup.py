import sqlite3


def test_admin_manual_backup_create_list_download(client, auth_headers, tmp_path, monkeypatch):
    from app.config import settings as cfg
    db = tmp_path / "menu.db"
    con = sqlite3.connect(db)
    con.execute("CREATE TABLE t(x)")
    con.commit()
    con.close()
    monkeypatch.setattr(cfg, "database_url", f"sqlite:///{db.as_posix()}")

    # Créer une sauvegarde
    r = client.post("/api/admin/backups", headers=auth_headers)
    assert r.status_code == 200
    name = r.json()["created"]["name"]
    assert name.startswith("menu-") and name.endswith(".db")

    # Elle apparaît dans la liste
    lst = client.get("/api/admin/backups", headers=auth_headers).json()
    assert lst["supported"] is True
    assert any(b["name"] == name for b in lst["backups"])

    # Téléchargement OK
    dl = client.get(f"/api/admin/backups/download?name={name}", headers=auth_headers)
    assert dl.status_code == 200

    # Anti-traversée de répertoire
    bad = client.get("/api/admin/backups/download?name=../menu.db", headers=auth_headers)
    assert bad.status_code == 400
