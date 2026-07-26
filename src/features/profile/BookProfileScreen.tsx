import { useParams } from 'react-router';
import { Placeholder } from '~/ui/Placeholder';

export function BookProfileScreen() {
  const { bookId } = useParams();

  return (
    <Placeholder title="Book profile" issue={36}>
      <p>
        The book as the page every chapter belongs to: cover, progress, chapter grid, your
        highlights.
      </p>
      <p className="mt-3 font-mono text-xs break-all">bookId: {bookId}</p>
    </Placeholder>
  );
}
