import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { TwitchApiError } from '@/lib/twitch/types';
import { ServicesProvider } from './services';

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Don't hammer Twitch when the token is bad.
            retry: (count, err) =>
              !(err instanceof TwitchApiError && err.status === 401) && count < 2,
            refetchOnWindowFocus: true,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <ServicesProvider>{children}</ServicesProvider>
    </QueryClientProvider>
  );
}
