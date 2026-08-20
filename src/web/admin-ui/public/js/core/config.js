export const API = Object.freeze({
  publicConfig: '/api/public/config',
  login: '/api/auth/login',
  logout: '/api/auth/logout',
  session: '/api/session',
  sessionContext: '/api/session/context',
  overview: '/api/overview',
  userSettings: '/api/settings/user',
  userPassword: '/api/settings/user/password',
  siteSettings: '/api/settings/site',
  animationSettings: '/api/settings/animation',
  animationProfiles: '/api/settings/animation/profiles',
  notifications: '/api/notifications',
  locations: '/api/locations',
  screens: '/api/screens',
  products: '/api/catalog/products',
  productsImport: '/api/catalog/products/import',
  productsExport: '/api/catalog/products/export.csv',
  packaging: '/api/catalog/packaging',
  sftpDirectories: '/api/sftp/directories',
  sftpConnection: '/api/sftp/connection',
  sftpOverview: '/api/sftp/overview'
});

export function pageName() {
  return document.body?.dataset?.page || '';
}
