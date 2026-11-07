// The real Supabase SDK talks to intercepted HTTP. SQL security is tested separately.
export async function workforceFixture(
  page,
  { role = 'hr', populated = false, missingMigration = false } = {},
) {
  const id = (prefix, n = 1) => `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const userId = id('0');
  const user = {
    id: userId,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'workspace-test@example.invalid',
    email_confirmed_at: '2026-11-07T00:00:00Z',
    created_at: '2026-11-07T00:00:00Z',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
  };
  const encode = (object) => Buffer.from(JSON.stringify(object)).toString('base64url');
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: userId, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.fixture`;
  const state = {
    organization: {
      id: id('1'),
      name: 'Workspace test organization',
      timezone: 'Asia/Kolkata',
      version: 1,
    },
    adminDisplayName: 'Workspace Test User',
    sites: [],
    departments: [],
    shifts: [],
    people: [],
    calls: [],
    nextError: null,
    accountCalls: [],
    pending: [],
    loseNextAccountResponse: false,
  };
  function profile(n) {
    return {
      id: id('4', n),
      display_name: `Directory Person ${String(n).padStart(2, '0')}`,
      employee_number: `SNR-${String(n).padStart(3, '0')}`,
      site_id: id('2'),
      site_name: 'Main office',
      department_id: id('3'),
      department_name: 'Operations',
      role: 'employee',
      active: true,
      email: `person-${n}@example.invalid`,
      is_self: n === 1,
      version: 1,
      membership_version: 1,
    };
  }
  if (populated) {
    state.sites = [
      { id: id('2'), name: 'Main office', timezone: 'Asia/Kolkata', active: true, version: 1 },
      { id: id('2', 2), name: 'Branch', timezone: 'UTC', active: true, version: 1 },
    ];
    state.departments = [{ id: id('3'), name: 'Operations', version: 1 }];
    state.people = Array.from({ length: 23 }, (_, i) => profile(i + 1));
  }
  function addProfile(parameters) {
    const p = parameters.profile;
    const person = {
      ...profile(state.people.length + 1),
      display_name: p.display_name,
      employee_number: p.employee_number,
      email: parameters.email,
      site_id: p.site_id,
      department_id: p.department_id,
      role: p.role,
      active: p.active,
      site_name: state.sites.find((s) => s.id === p.site_id).name,
      department_name: state.departments.find((d) => d.id === p.department_id).name,
    };
    state.people.push(person);
    return person;
  }
  await page.route('**/api/admin/staff**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const parameters = route.request().postDataJSON();
    state.accountCalls.push({ path, parameters });
    const reply = (json, status = 200) =>
      route.fulfill({ status, json, headers: { 'Cache-Control': 'no-store' } });
    if (role !== 'hr') return reply({ error: { code: 'access_denied' } }, 403);
    if (path.endsWith('/recover')) {
      const operation = state.pending.find((op) => path.includes(op.id));
      if (operation) {
        const person = addProfile(operation.payload);
        state.pending = state.pending.filter((op) => op !== operation);
        return reply({ status: 'completed', employee_id: person.id });
      }
      return reply({ status: 'failed' });
    }
    if (state.nextError) {
      const error = state.nextError;
      state.nextError = null;
      return reply({ error, operation_closed: true }, 422);
    }
    if (path.endsWith('/account')) {
      const person = state.people.find((p) => path.includes(p.id));
      if (person.version !== parameters.version)
        return reply({ error: { code: 'record_changed' } }, 409);
      person.email = parameters.email;
      person.version++;
      return reply({ status: 'completed', employee_id: person.id });
    }
    if (state.loseNextAccountResponse) {
      state.loseNextAccountResponse = false;
      state.pending.push({
        id: parameters.request_id,
        email: parameters.email,
        action: 'create',
        can_close: true,
        created_at: new Date().toISOString(),
        payload: parameters,
      });
      return reply(
        { error: { code: 'request_interrupted' }, operation_id: parameters.request_id },
        503,
      );
    }
    return reply({ status: 'completed', employee_id: addProfile(parameters).id });
  });
  await page.route('https://auth.snr-nest.test/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const headers = {
      'Access-Control-Allow-Origin': 'http://127.0.0.1:5174',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': '*',
    };
    const reply = (json, status = 200) => route.fulfill({ headers, json, status });
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (path === '/auth/v1/token')
      return reply({
        access_token: token,
        token_type: 'bearer',
        expires_in: 3600,
        refresh_token: 'workforce-fixture-refresh',
        user,
      });
    if (path === '/auth/v1/user') return reply(user);
    if (path === '/auth/v1/logout') return route.fulfill({ status: 204, headers });
    if (path === '/rest/v1/rpc/current_workspace')
      return reply({
        user_id: userId,
        organization_id: state.organization.id,
        organization_name: state.organization.name,
        display_name: state.adminDisplayName,
        role,
        employee_id: null,
        team_ids: [],
        site_ids: [],
      });
    const name = path.replace('/rest/v1/rpc/', '');
    const parameters = route.request().postDataJSON();
    state.calls.push({ name, parameters });
    if (missingMigration) return reply({ code: 'PGRST202', message: 'missing procedure' }, 404);
    if (state.nextError && name.startsWith('hr_save_')) {
      const error = state.nextError;
      state.nextError = null;
      return reply(error, 422);
    }
    if (name === 'hr_organization_setup')
      return reply({
        ...state,
        counts: {
          employees: state.people.length,
          active_employees: state.people.filter((p) => p.active).length,
          supervisors: state.people.filter((p) => p.role === 'supervisor' && p.active).length,
        },
      });
    if (name === 'hr_pending_staff_accounts')
      return reply(state.pending.map(({ payload: _payload, ...operation }) => operation));
    if (name === 'hr_workspace_settings')
      return reply({ ...state.organization, display_name: state.adminDisplayName });
    if (name === 'hr_save_workspace_settings') {
      state.organization.name = parameters.p_name;
      state.organization.timezone = parameters.p_timezone;
      state.organization.version++;
      state.adminDisplayName = parameters.p_display_name;
      return reply({ ...state.organization, display_name: state.adminDisplayName });
    }
    if (name === 'hr_close_staff_account') {
      state.pending = state.pending.filter((op) => op.id !== parameters.p_request_id);
      return reply({ status: 'failed' });
    }
    if (name === 'workforce_directory') {
      let people = role === 'employee' ? state.people.slice(0, 1) : state.people;
      people = people.filter(
        (p) =>
          (!parameters.p_site_id || p.site_id === parameters.p_site_id) &&
          (!parameters.p_department_id || p.department_id === parameters.p_department_id) &&
          (parameters.p_status === 'all' || p.active === (parameters.p_status === 'active')) &&
          `${p.display_name} ${p.employee_number}`
            .toLowerCase()
            .includes(parameters.p_search.toLowerCase()),
      );
      return reply({
        rows: people.slice((parameters.p_page - 1) * 20, parameters.p_page * 20),
        total: people.length,
        page: parameters.p_page,
        page_size: 20,
      });
    }
    if (name === 'hr_save_employee') {
      const index = state.people.findIndex((p) => p.id === parameters.p_id);
      const person = {
        ...(index < 0 ? profile(state.people.length + 1) : state.people[index]),
        display_name: parameters.p_display_name,
        employee_number: parameters.p_employee_number,
        email: parameters.p_email,
        role: parameters.p_role,
        active: parameters.p_active,
        site_id: parameters.p_site_id,
        site_name: state.sites.find((s) => s.id === parameters.p_site_id).name,
        department_id: parameters.p_department_id,
        department_name: state.departments.find((d) => d.id === parameters.p_department_id).name,
      };
      if (index < 0) state.people.push(person);
      else {
        person.version++;
        person.membership_version++;
        state.people[index] = person;
      }
      return reply(person.id);
    }
    const type = name.replace('hr_save_', '');
    const collection =
      type === 'site'
        ? state.sites
        : type === 'department'
          ? state.departments
          : type === 'shift'
            ? state.shifts
            : null;
    if (collection) {
      const index = collection.findIndex((p) => p.id === parameters.p_id);
      const record = {
        id:
          parameters.p_id ||
          id(type === 'site' ? '2' : type === 'department' ? '3' : '5', collection.length + 1),
        name: parameters.p_name,
        version: index < 0 ? 1 : collection[index].version + 1,
        ...(type === 'site' ? { timezone: parameters.p_timezone, active: true } : {}),
        ...(type === 'shift'
          ? {
              site_id: parameters.p_site_id,
              site_name: state.sites.find((s) => s.id === parameters.p_site_id).name,
              starts_at: parameters.p_starts_at,
              ends_at: parameters.p_ends_at,
              timezone: state.sites.find((s) => s.id === parameters.p_site_id).timezone,
            }
          : {}),
      };
      if (index < 0) collection.push(record);
      else collection[index] = record;
      return reply(record.id);
    }
    throw new Error(`Unexpected workforce request: ${path}`);
  });
  return state;
}

export async function signInWorkforce(page) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill('workspace-test@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('workforce-test-password');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
}
