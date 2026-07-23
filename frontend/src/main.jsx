import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import "./index.css";
import "./i18n";
import App from "./App.jsx";
import { store } from "./store/store";
import AuthSessionBootstrap from "./shared/components/AuthSessionBootstrap";

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <Provider store={store}>
        {googleClientId ? (
          <GoogleOAuthProvider clientId={googleClientId}>
            <AuthSessionBootstrap>
              <App />
            </AuthSessionBootstrap>
          </GoogleOAuthProvider>
        ) : (
          <AuthSessionBootstrap>
            <App />
          </AuthSessionBootstrap>
        )}
      </Provider>
    </BrowserRouter>
  </StrictMode>
);
