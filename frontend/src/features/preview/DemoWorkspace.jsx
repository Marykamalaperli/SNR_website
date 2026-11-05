import { useReducer } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { createDemoState, sampleDay, sampleLabel } from '../../data/demoData';
import { WorkspaceContext } from '../../hooks/useWorkspace';
import DashboardLayout from '../../layouts/DashboardLayout';
import NotFoundPage from '../../pages/NotFoundPage';
import EmployeeWorkspace from '../employee/EmployeeWorkspace';
import SupervisorWorkspace from '../supervisor/SupervisorWorkspace';
import HrWorkspace from '../hr/HrWorkspace';

const roles = { me: 'employee', team: 'supervisor', hr: 'hr' };
const people = {
  employee: { name: 'Alex Morgan', initials: 'AM' },
  supervisor: { name: 'Priya Sharma', initials: 'PS' },
  hr: { name: 'Meera Patel', initials: 'MP' },
};

function reducer(state, action) {
  if (action.type === 'punch') {
    if (state.clock.status === 'Clocked out') return state;
    const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(
      new Date(),
    );
    const isIn = state.clock.status === 'Not started';
    return {
      ...state,
      clock: {
        ...state.clock,
        status: isIn ? 'Clocked in' : 'Clocked out',
        [isIn ? 'clockIn' : 'clockOut']: time,
      },
      notice: isIn
        ? 'Sample clock-in recorded. Have a good day!'
        : 'Sample clock-out recorded. You’re all done for today.',
    };
  }
  if (action.type === 'correction') {
    return {
      ...state,
      corrections: [
        {
          ...action.payload,
          id: `CR-S${state.corrections.length + 1}`,
          employeeId: 'SNR-001',
          name: 'Alex Morgan',
          department: 'Operations',
          status: 'Pending',
          recommendation: null,
        },
        ...state.corrections,
      ],
      notice: 'Sample request submitted for supervisor review.',
    };
  }
  if (action.type === 'review') {
    return {
      ...state,
      corrections: state.corrections.map((item) =>
        item.id === action.id && item.status === 'Pending'
          ? {
              ...item,
              [action.final ? 'status' : 'recommendation']: action.decision,
              reviewNote: action.note,
            }
          : item,
      ),
      notice: action.final
        ? `Sample request ${action.decision.toLowerCase()}.`
        : 'Sample recommendation saved for HR review.',
    };
  }
  return state;
}

function DemoInstance({ role }) {
  const [data, dispatch] = useReducer(reducer, role, createDemoState);
  const { pathname } = useLocation();
  const base = `/preview/${role === 'employee' ? 'me' : role === 'supervisor' ? 'team' : 'hr'}`;
  const section = pathname.slice(base.length).replace(/^\/|\/$/g, '');
  const RoleContent = {
    employee: EmployeeWorkspace,
    supervisor: SupervisorWorkspace,
    hr: HrWorkspace,
  }[role];
  return (
    <WorkspaceContext.Provider
      value={{
        role,
        isPreview: true,
        base,
        user: people[role],
        data,
        dispatch,
        sampleDay,
        dateLabel: sampleLabel,
      }}
    >
      <DashboardLayout>
        <RoleContent section={section} />
      </DashboardLayout>
    </WorkspaceContext.Provider>
  );
}

export default function DemoWorkspace() {
  const { workspace } = useParams();
  const role = roles[workspace];
  return role ? <DemoInstance key={role} role={role} /> : <NotFoundPage />;
}
