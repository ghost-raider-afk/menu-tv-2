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
  notifications: '/api/notifications',
  locations: '/api/locations',
  screens: '/api/screens',
  products: '/api/catalog/products',
  productsImport: '/api/catalog/products/import',
  productsExport: '/api/catalog/products/export.csv',
  packaging: '/api/catalog/packaging',
  sftpDirectories: '/api/sftp/directories',
  sftpConnection: '/api/sftp/connection'
});

export function pageName() {
  return document.body?.dataset?.page || '';
}
