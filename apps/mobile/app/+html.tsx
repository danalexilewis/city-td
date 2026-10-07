import { ScrollViewStyleReset } from 'expo-router/html';
import type { ReactNode } from 'react';

import { colours } from '@/theme';

/**
 * Web-only root HTML shell for static rendering.
 */
export default function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `body { background-color: ${colours.paper}; }`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
