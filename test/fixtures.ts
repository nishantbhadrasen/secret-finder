// Fake secrets are assembled at runtime so this repo never contains a literal
// token (which would trip GitHub push protection and secret-finder itself).
export const fake = {
  aws: 'AKIA' + 'Z7Q2'.repeat(4),
  github: 'ghp_' + 'a1B2'.repeat(9),
  privateKey: '-----BEGIN RSA ' + 'PRIVATE KEY-----',
  slack: 'xox' + 'b-1234567890-' + 'AbCdEfGhIj',
  stripe: 'sk_' + 'live_' + 'Ab12'.repeat(6),
  google: 'AI' + 'za' + 'Sy'.repeat(17) + 'Q',
  jwt: 'eyJ' + 'hbGciOiJIUzI1NiJ9' + '.eyJ' + 'zdWIiOiIxMjM0NTY3ODkwIn0' + '.' + 'SflKxwRJSMeKKF2QT4fw',
  password: 'Xk9#mQ2$' + 'vL7pR4zW',
};
