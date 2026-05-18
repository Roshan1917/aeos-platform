import { Navigate, type RouteObject } from 'react-router-dom';

import { AuthGuard } from './components/AuthGuard';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Agents } from './pages/Agents';
import { AgentDetail } from './pages/AgentDetail';
import { UoPs } from './pages/UoPs';
import { UoPDetail } from './pages/UoPDetail';
import { Processes } from './pages/Processes';
import { ProcessDetail } from './pages/ProcessDetail';
import { Discovery } from './pages/Discovery';
import { Telemetry } from './pages/Telemetry';
import { TraceDetail } from './pages/TraceDetail';
import { Recommendations } from './pages/Recommendations';
import { RecommendationDetail } from './pages/RecommendationDetail';
import { Settings } from './pages/Settings';
import { TestCases } from './pages/TestCases';
import { TestCaseDetail } from './pages/TestCaseDetail';

export const routes: RouteObject[] = [
  { path: '/login', element: <Login /> },
  {
    element: (
      <AuthGuard>
        <Layout />
      </AuthGuard>
    ),
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'agents', element: <Agents /> },
      { path: 'agents/:id', element: <AgentDetail /> },
      { path: 'uops', element: <UoPs /> },
      { path: 'uops/:id', element: <UoPDetail /> },
      { path: 'processes', element: <Processes /> },
      { path: 'processes/discover', element: <Discovery /> },
      { path: 'processes/:id', element: <ProcessDetail /> },
      { path: 'telemetry', element: <Telemetry /> },
      { path: 'traces/:trace_id', element: <TraceDetail /> },
      { path: 'recommendations', element: <Recommendations /> },
      { path: 'recommendations/:id', element: <RecommendationDetail /> },
      { path: 'test-cases', element: <TestCases /> },
      { path: 'test-cases/:id', element: <TestCaseDetail /> },
      { path: 'settings', element: <Settings /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
];
