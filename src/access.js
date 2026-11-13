const ADMIN_ONLY_ACTIONS = new Set(['delete', 'admin-list']);

export function actionRequiresAdmin(action) {
  return ADMIN_ONLY_ACTIONS.has(action);
}

export function activityListCapabilities(isAdmin) {
  const admin = !!isAdmin;
  return {
    view: true,
    edit: true,
    reorder: true,
    deleteMode: admin,
    exportWord: true,
  };
}
