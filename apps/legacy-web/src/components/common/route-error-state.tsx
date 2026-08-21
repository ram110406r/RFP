import { useRouter } from "@tanstack/react-router";
import { ErrorState } from "@/components/common/error-state";

/**
 * Route-level errorComponent. TanStack Router wraps every route match in its
 * own catch boundary that does NOT inherit the root route's errorComponent,
 * so loader errors (e.g. an unknown :id) fall through to the framework's raw
 * default box unless each dynamic route opts in with its own errorComponent.
 */
export function RouteErrorState({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();

  return (
    <ErrorState
      title="This page couldn't be loaded"
      description={error.message || "Something went wrong loading this page."}
      onRetry={() => {
        router.invalidate();
        reset();
      }}
    />
  );
}
