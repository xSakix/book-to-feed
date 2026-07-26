import { useParams } from 'react-router';
import { Placeholder } from '~/ui/Placeholder';

export function FeedScreen() {
  const { bookId, chapter, post } = useParams();

  return (
    <Placeholder title="Chapter feed" issue={26}>
      <p>
        The chapter&apos;s posts, scrolled top to bottom, ending with the next chapter arriving as a
        friend request.
      </p>
      <p className="mt-3 font-mono text-xs break-all">
        bookId: {bookId} · chapter: {chapter}
        {post ? ` · post: ${post}` : ''}
      </p>
    </Placeholder>
  );
}
