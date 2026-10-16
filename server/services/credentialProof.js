// Server memory only: never serialize a verified password hash into a DTO/token.
const proofs = new WeakMap();
const withVerifiedPassword = (user, passwordHash) => { proofs.set(user, passwordHash); return user; };
const getVerifiedPassword = (user) => proofs.get(user);
module.exports = { withVerifiedPassword, getVerifiedPassword };
