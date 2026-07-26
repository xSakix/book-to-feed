import { Placeholder } from '~/ui/Placeholder';

export function ImportScreen() {
  return (
    <Placeholder title="Import a book" issue={19}>
      <p>
        Drop an EPUB here and it is unzipped, parsed and turned into a feed in this browser. The
        file never crosses the network.
      </p>
    </Placeholder>
  );
}
