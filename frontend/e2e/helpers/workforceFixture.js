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
    assignments: [],
    sessions: [],
    punches: [],
    locations: new Map(),
    locationEnabled: true,
    storePolicyEnabled: true,
    storeAreas: new Map(),
    evidenceEnabled: true,
    storageEnabled: true,
    photoOnlyEnabled: true,
    photoFiles: new Map(),
    loseNextPunchResponse: false,
    today: new Date().toISOString().slice(0, 10),
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
  async function handlePhoto(route, parameters, reply) {
    if (role !== 'employee')
      return reply({ code: 'PT403', message: 'workforce_access_denied' }, 403);
    const existing = state.punches.find((punch) => punch.request_id === parameters.p_request_id);
    if (existing)
      return reply({
        ...existing,
        replayed: true,
        location_saved: true,
        storage_saved: true,
        photo_saved: true,
        qr_verified: false,
        qr_required: false,
      });
    const person = state.people[0];
    if (!parameters.p_evidence?.photo?.jpeg_base64)
      return reply({ code: 'PT422', message: 'attendance_evidence_required' }, 422);
    if (
      !parameters.p_location ||
      parameters.p_location.consent_version !== 'attendance-location-v1'
    )
      return reply({ code: 'PT422', message: 'attendance_location_required' }, 422);
    if (parameters.p_employee_id !== person.id)
      return reply({ code: 'PT409', message: 'attendance_changed' }, 409);
    const plan = state.assignments.find(
      (assignment) => assignment.employee_id === person.id && !assignment.cancelled,
    );
    if (!plan) return reply({ code: 'PT409', message: 'shift_not_assigned' }, 409);
    const last = state.punches.at(-1);
    if ((last?.id || null) !== parameters.p_previous_event_id)
      return reply({ code: 'PT409', message: 'attendance_changed' }, 409);
    const area = state.storeAreas.get(person.site_id);
    if (!area) return reply({ code: 'PT409', message: 'store_area_not_configured' }, 409);
    const radians = (degrees) => (degrees * Math.PI) / 180;
    const fix = parameters.p_location;
    const distance =
      12742000 *
      Math.asin(
        Math.sqrt(
          Math.min(
            1,
            Math.sin(radians(fix.latitude - area.latitude) / 2) ** 2 +
              Math.cos(radians(area.latitude)) *
                Math.cos(radians(fix.latitude)) *
                Math.sin(radians(fix.longitude - area.longitude) / 2) ** 2,
          ),
        ),
      );
    if (distance > area.radius_meters)
      return reply({ code: 'PT409', message: 'outside_store_area' }, 409);
    if (distance + fix.accuracy_meters > area.radius_meters)
      return reply({ code: 'PT409', message: 'store_location_uncertain' }, 409);
    const punch = {
      id: id('9', state.punches.length + 1),
      request_id: parameters.p_request_id,
      event_type: parameters.p_event_type,
      occurred_at: `${state.today}T${parameters.p_event_type === 'clock_in' ? '04' : '12'}:00:00Z`,
    };
    state.punches.push(punch);
    const bucket = punch.event_type === 'clock_in' ? 'attendance-clock-in' : 'attendance-clock-out';
    const filename =
      userId +
      '_' +
      new Date().toISOString().replace('T', '_').replace('Z', '').replaceAll(':', '-') +
      '_' +
      parameters.p_request_id +
      '.jpg';
    const objectPath = state.organization.id + '/' + userId + '/' + filename;
    state.photoFiles.set(
      bucket + '/' + objectPath,
      Buffer.from(parameters.p_evidence.photo.jpeg_base64, 'base64'),
    );
    state.locations.set(punch.id, {
      ...parameters.p_location,
      recorded_at: punch.occurred_at,
      event_type: punch.event_type,
      store_distance_meters: distance,
      store_radius_meters: area.radius_meters,
      store_policy_version: area.version,
      store_rule_version: 'store-radius-v1',
      photo: {
        bucket_id: bucket,
        object_path: objectPath,
        captured_at: parameters.p_evidence.photo.captured_at,
        qr_verified: false,
        qr_required: false,
        qr_version: null,
      },
    });
    if (punch.event_type === 'clock_in')
      state.sessions.push({
        id: punch.id,
        employee_id: person.id,
        display_name: person.display_name,
        employee_number: person.employee_number,
        site_id: person.site_id,
        department_id: person.department_id,
        site_name: person.site_name,
        department_name: person.department_name,
        shift_name: plan.name,
        timezone: plan.timezone,
        assignment_id: plan.id,
        attendance_date: state.today,
        clock_in: punch.occurred_at,
        clock_out: null,
        status: 'open',
        duration_seconds: null,
      });
    else
      Object.assign(state.sessions.at(-1), {
        clock_out: punch.occurred_at,
        status: 'closed',
        duration_seconds: 28800,
        clock_out_event_id: punch.id,
      });
    if (state.loseNextPunchResponse) {
      state.loseNextPunchResponse = false;
      return route.abort('failed');
    }
    return reply({
      ...punch,
      replayed: false,
      location_saved: true,
      storage_saved: true,
      photo_saved: true,
      qr_verified: false,
      qr_required: false,
    });
  }
  await page.route('**/api/attendance/photos', async (route) => {
    const body = route.request().postDataJSON();
    const parameters = {
      p_event_type: body.type,
      p_request_id: body.id,
      p_previous_event_id: body.previousId,
      p_employee_id: body.employeeId,
      p_location: body.location,
      p_evidence: body.evidence,
    };
    state.calls.push({ name: 'record_attendance', parameters });
    return handlePhoto(route, parameters, (json, status = 200) =>
      route.fulfill({ status, json, headers: { 'Cache-Control': 'no-store' } }),
    );
  });
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
    if (path.startsWith('/storage/v1/object/sign/')) {
      const key = path.replace('/storage/v1/object/sign/', '');
      if (route.request().method() === 'POST')
        return reply({ signedURL: '/object/sign/' + key + '?token=fixture' });
      return route.fulfill({
        headers: { ...headers, 'Content-Type': 'image/jpeg' },
        body: state.photoFiles.get(key),
      });
    }
    const name = path.replace('/rest/v1/rpc/', '');
    const parameters = route.request().postDataJSON();
    state.calls.push({ name, parameters });
    if (missingMigration) return reply({ code: 'PGRST202', message: 'missing procedure' }, 404);
    if (name === 'hr_employee_shifts') {
      const person = state.people.find((person) => person.id === parameters.p_employee_id);
      return reply({
        employee_id: person.id,
        employee_version: person.version,
        today: state.today,
        timezone: 'Asia/Kolkata',
        shifts: state.shifts.filter((shift) => shift.site_id === person.site_id),
        assignments: state.assignments
          .filter((assignment) => assignment.employee_id === person.id)
          .map((assignment) => ({
            ...assignment,
            can_edit: !assignment.cancelled,
            can_cancel:
              !assignment.cancelled &&
              !state.sessions.some((session) => session.assignment_id === assignment.id),
          })),
      });
    }
    if (name === 'hr_save_employee_shift') {
      const person = state.people.find((person) => person.id === parameters.p_employee_id);
      if (person.version !== parameters.p_employee_version)
        return reply({ code: 'PT409', message: 'record_changed' }, 409);
      if (parameters.p_id) {
        const plan = state.assignments.find((assignment) => assignment.id === parameters.p_id);
        plan.ends_on = parameters.p_ends_on;
        plan.cancelled = parameters.p_cancel;
        plan.version++;
      } else {
        if (
          state.assignments.some(
            (assignment) =>
              !assignment.cancelled &&
              assignment.employee_id === person.id &&
              (!assignment.ends_on || assignment.ends_on >= parameters.p_starts_on),
          )
        )
          return reply({ code: 'PT409', message: 'shift_assignment_overlap' }, 409);
        const shift = state.shifts.find((shift) => shift.id === parameters.p_shift_id);
        state.assignments.push({
          id: id('8', state.assignments.length + 1),
          employee_id: person.id,
          shift_id: shift.id,
          name: shift.name,
          starts_on: parameters.p_starts_on,
          ends_on: parameters.p_ends_on,
          timezone: shift.timezone,
          cancelled: false,
          version: 1,
        });
      }
      person.version++;
      return reply(parameters.p_id || state.assignments.at(-1).id);
    }
    if (name === 'attendance_workspace') {
      const person = state.people[0];
      const plan = state.assignments.find(
        (assignment) => assignment.employee_id === person?.id && !assignment.cancelled,
      );
      const shift = state.shifts.find((shift) => shift.id === plan?.shift_id);
      const last = state.punches.at(-1);
      return reply({
        role,
        today: state.today,
        location_required: state.locationEnabled,
        evidence_required: state.evidenceEnabled,
        storage_required: state.storageEnabled,
        camera_location_policy: 'location-before-camera-v1',
        qr_required: !state.photoOnlyEnabled,
        attendance_capture_policy: state.photoOnlyEnabled ? 'store-50m-photo-v1' : null,
        attendance_radius_meters: 50,
        evidence_notice_version: 'attendance-photo-location-v1',
        location_notice_version: 'attendance-location-v1',
        store_geofence_required: state.storePolicyEnabled,
        store_geofence_policy: 'store-radius-v1',
        attendance_area: {
          configured: state.storeAreas.has(person?.site_id),
          radius_meters: state.storeAreas.get(person?.site_id)?.radius_meters,
          site_name: person?.site_name,
        },
        timezone: 'Asia/Kolkata',
        server_time: `${state.today}T04:00:00Z`,
        sites: state.sites,
        departments: state.departments,
        ...(role === 'employee'
          ? {
              employee_id: person?.id,
              site_name: person?.site_name,
              site_active: true,
              last_event_id: last?.id || null,
              last_request_id: last?.request_id || null,
              status: last?.event_type === 'clock_in' ? 'clocked_in' : 'clocked_out',
              open_since: last?.occurred_at,
              shift: shift
                ? {
                    name: shift.name,
                    timezone: shift.timezone,
                    work_date: state.today,
                    scheduled_start: `${state.today}T04:00:00Z`,
                    scheduled_end: `${state.today}T12:00:00Z`,
                  }
                : null,
              schedule: state.assignments
                .filter(
                  (assignment) => assignment.employee_id === person?.id && !assignment.cancelled,
                )
                .map((assignment) => ({
                  ...assignment,
                  ...state.shifts.find((shift) => shift.id === assignment.shift_id),
                  id: assignment.id,
                  site_name: person.site_name,
                })),
            }
          : {}),
      });
    }
    if (name === 'validate_attendance_location') {
      const area = state.storeAreas.get(state.people[0]?.site_id);
      if (!area) return reply({ code: 'PT409', message: 'store_area_not_configured' }, 409);
      const distance = Math.hypot(
        (parameters.p_location.latitude - area.latitude) * 111195,
        (parameters.p_location.longitude - area.longitude) * 108000,
      );
      if (distance > area.radius_meters)
        return reply({ code: 'PT409', message: 'outside_store_area' }, 409);
      if (distance + parameters.p_location.accuracy_meters > area.radius_meters)
        return reply({ code: 'PT409', message: 'store_location_uncertain' }, 409);
      return reply({
        site_id: state.people[0].site_id,
        distance_meters: distance,
        radius_meters: area.radius_meters,
      });
    }
    if (name === 'record_attendance') return handlePhoto(route, parameters, reply);
    if (name === 'attendance_location_details') {
      if (role === 'supervisor')
        return reply({ code: 'PT403', message: 'workforce_access_denied' }, 403);
      const session = state.sessions.find((session) => session.id === parameters.p_session_id);
      if (!session || (role === 'employee' && session.employee_id !== state.people[0].id))
        return reply({ code: 'PT404', message: 'record_unavailable' }, 404);
      return reply({
        session_id: session.id,
        timezone: session.timezone,
        clock_in: state.locations.get(session.id) || null,
        clock_out: state.locations.get(session.clock_out_event_id) || null,
      });
    }
    if (name === 'attendance_records') {
      let sessions = state.sessions.filter(
        (session) =>
          session.attendance_date >= parameters.p_from &&
          session.attendance_date <= parameters.p_to,
      );
      if (role === 'employee')
        sessions = sessions.filter((session) => session.employee_id === state.people[0]?.id);
      if (parameters.p_site_id)
        sessions = sessions.filter((session) => session.site_id === parameters.p_site_id);
      if (parameters.p_department_id)
        sessions = sessions.filter(
          (session) => session.department_id === parameters.p_department_id,
        );
      if (parameters.p_status !== 'all')
        sessions = sessions.filter((session) => session.status === parameters.p_status);
      if (parameters.p_search)
        sessions = sessions.filter((session) =>
          `${session.display_name} ${session.employee_number}`
            .toLowerCase()
            .includes(parameters.p_search.toLowerCase()),
        );
      return reply({
        rows: sessions
          .slice((parameters.p_page - 1) * 20, parameters.p_page * 20)
          .map((session) => ({
            ...session,
            ...(role === 'supervisor'
              ? {}
              : {
                  clock_in_location_available: state.locations.has(session.id),
                  clock_out_location_available: state.locations.has(session.clock_out_event_id),
                }),
          })),
        total: sessions.length,
        page: parameters.p_page,
        page_size: 20,
        summary: {
          sessions: sessions.length,
          open: sessions.filter((session) => session.status === 'open').length,
          completed_seconds: sessions.reduce(
            (seconds, session) => seconds + (session.duration_seconds || 0),
            0,
          ),
        },
      });
    }
    if (state.nextError && name.startsWith('hr_save_')) {
      const error = state.nextError;
      state.nextError = null;
      return reply(error, 422);
    }
    if (name === 'hr_site_attendance_area') {
      const site = state.sites.find((site) => site.id === parameters.p_site_id);
      return reply({
        site_id: site.id,
        site_name: site.name,
        configured: state.storeAreas.has(site.id),
        latitude: null,
        longitude: null,
        radius_meters: 50,
        version: null,
        ...state.storeAreas.get(site.id),
      });
    }
    if (name === 'hr_save_site_attendance_area') {
      const previous = state.storeAreas.get(parameters.p_site_id);
      if ((previous?.version ?? null) !== parameters.p_version)
        return reply({ code: 'PT409', message: 'record_changed' }, 409);
      const area = {
        map_url: parameters.p_map_url || '',
        latitude: parameters.p_latitude,
        longitude: parameters.p_longitude,
        radius_meters: parameters.p_radius_meters,
        version: (previous?.version || 0) + 1,
      };
      state.storeAreas.set(parameters.p_site_id, area);
      return reply({ site_id: parameters.p_site_id, version: area.version });
    }
    if (name === 'hr_organization_setup')
      return reply({
        ...state,
        sites: state.sites.map((site) => ({
          ...site,
          attendance_area_configured: state.storeAreas.has(site.id),
          attendance_radius_meters: state.storeAreas.get(site.id)?.radius_meters,
        })),
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
    const type = name === 'hr_save_attendance_site' ? 'site' : name.replace('hr_save_', '');
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
      if (name === 'hr_save_attendance_site')
        state.storeAreas.set(record.id, {
          map_url: parameters.p_map_url || '',
          latitude: parameters.p_latitude,
          longitude: parameters.p_longitude,
          radius_meters: parameters.p_radius_meters,
          version: (state.storeAreas.get(record.id)?.version || 0) + 1,
        });
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
