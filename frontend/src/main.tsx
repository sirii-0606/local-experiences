import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import "leaflet/dist/leaflet.css";
import "./styles.css";
import App from "./App";
import { AuthProvider } from "./auth";
import { ClockProvider } from "./clock";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ClockProvider>
          <App />
        </ClockProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
