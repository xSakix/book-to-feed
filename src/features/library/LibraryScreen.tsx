import { Link } from 'react-router';
import { Placeholder } from '~/ui/Placeholder';

export function LibraryScreen() {
  return (
    <Placeholder title="Your library" issue={19}>
      <p>
        Books you have imported will live here. Nothing is uploaded anywhere — everything stays on
        this device.
      </p>
      <p className="mt-3">
        <Link className="text-accent underline underline-offset-2" to="/import">
          Import a book
        </Link>
      </p>
    </Placeholder>
  );
}
