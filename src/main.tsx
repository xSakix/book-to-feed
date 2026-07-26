import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { router } from './app/router';
import { startThemeSync } from './app/theme';
import './ui/index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element missing from index.html');

// Applied before the first paint — see the note in index.html about why this
// cannot be an inline script.
startThemeSync();

createRoot(container).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
