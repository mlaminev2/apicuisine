export const state = {
  token: localStorage.getItem("token") || "",
  memberId: localStorage.getItem("memberId") ? parseInt(localStorage.getItem("memberId")) : null,
  memberName: localStorage.getItem("memberName") || "",
  householdId: localStorage.getItem("householdId") ? parseInt(localStorage.getItem("householdId")) : null,
  isOwner: localStorage.getItem("isOwner") === "true",

  setAuth(token, householdId, memberId, memberName, isOwner) {
    this.token = token;
    this.householdId = householdId;
    this.memberId = memberId || null;
    this.memberName = memberName || "";
    this.isOwner = !!isOwner;
    localStorage.setItem("token", token);
    localStorage.setItem("householdId", householdId);
    if (memberId) localStorage.setItem("memberId", memberId);
    if (memberName) localStorage.setItem("memberName", memberName);
    localStorage.setItem("isOwner", isOwner ? "true" : "false");
  },

  clearAuth() {
    this.token = "";
    this.householdId = null;
    this.memberId = null;
    this.memberName = "";
    this.isOwner = false;
    localStorage.removeItem("token");
    localStorage.removeItem("householdId");
    localStorage.removeItem("memberId");
    localStorage.removeItem("memberName");
    localStorage.removeItem("isOwner");
  },

  isLoggedIn() { return !!this.token; },

  cache: {},
  set(key, value) { this.cache[key] = value; },
  get(key) { return this.cache[key]; },
};

window._state = state;
