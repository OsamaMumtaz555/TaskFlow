import axios from "axios";

const api = axios.create({
  // Falls back to localhost for development; set VITE_API_URL when deploying
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
});

// Runs before every request made with this `api` instance
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Runs after every response. If the server says our login is invalid or expired,
// clear the saved session and send the user back to the login page.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const isAuthRequest = error.config?.url?.includes("/auth/");

    // A 401 on login/register just means wrong credentials, so let the form show its message
    if (status === 401 && !isAuthRequest) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      if (window.location.pathname !== "/") {
        window.location.href = "/";
      }
    }
    return Promise.reject(error);
  }
);

export default api; 