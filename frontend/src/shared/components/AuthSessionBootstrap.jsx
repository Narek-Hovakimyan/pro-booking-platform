import { useEffect, useState } from "react";

import {
  applyRefreshedAuthSession,
  expireCurrentAuthSession,
  requestRefreshSession,
} from "@/shared/api/authSession";

let bootstrapPromise = null;

function startBootstrap() {
  if (!bootstrapPromise) {
    bootstrapPromise = requestRefreshSession()
      .then((session) => applyRefreshedAuthSession(session))
      .catch(() => expireCurrentAuthSession());
  }

  return bootstrapPromise;
}

export default function AuthSessionBootstrap({ children }) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    startBootstrap().finally(() => {
      if (isMounted) {
        setIsReady(true);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  if (!isReady) {
    return null;
  }

  return children;
}
