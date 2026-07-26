import { createBrowserRouter } from 'react-router';
import { AppShell } from './AppShell';
import { NotFoundScreen } from './NotFoundScreen';
import { LibraryScreen } from '~/features/library/LibraryScreen';
import { ImportScreen } from '~/features/library/ImportScreen';
import { BookProfileScreen } from '~/features/profile/BookProfileScreen';
import { FeedScreen } from '~/features/feed/FeedScreen';
import { GraphScreen } from '~/features/graph/GraphScreen';
import { SettingsScreen } from '~/features/settings/SettingsScreen';

/** The route table from ARCHITECTURE.md §10. */
export const routes = [
  {
    element: <AppShell />,
    errorElement: <NotFoundScreen />,
    children: [
      { path: '/', element: <LibraryScreen /> },
      { path: '/import', element: <ImportScreen /> },
      { path: '/b/:bookId', element: <BookProfileScreen /> },
      { path: '/b/:bookId/c/:chapter', element: <FeedScreen /> },
      { path: '/b/:bookId/c/:chapter/p/:post', element: <FeedScreen /> },
      { path: '/b/:bookId/graph', element: <GraphScreen /> },
      { path: '/settings', element: <SettingsScreen /> },
      { path: '*', element: <NotFoundScreen /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
