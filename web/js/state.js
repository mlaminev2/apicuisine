export const state = {
  token: localStorage.getItem("token") || "",
  memberId: localStorage.getItem("memberId") ? parseInt(localStorage.getItem("memberId")) : null,
  memberName: localStorage.getItem("memberName") || "",
  householdId: localStorage.getItem("householdId") ? parseInt(localStorage.getItem("householdId")) : null,

  setAuth(token, householdId, memberId, memberName) {
    this.token = token;
    this.householdId = householdId;
    this.memberId = memberId || null;
    this.memberName = memberName || "";
    localStorage.setItem("token", token);
    localStorage.setItem("householdId", householdId);
    if (memberId) localStorage.setItem("memberId", memberId);
    if (memberName) localStorage.setItem("memberName", memberName);
  },

  clearAuth() {
    this.token = "";
    this.householdId = null;
    this.memberId = null;
    this.memberName = "";
    localStorage.removeItem("token");
    localStorage.removeItem("householdId");
    localStorage.removeItem("memberId");
    localStorage.removeItem("memberName");
  },

  isLoggedIn() { return !!this.token; },

  cache: {},
  set(key, value) { this.cache[key] = value; },
  get(key) { return this.cache[key]; },
};

window._state = state;
