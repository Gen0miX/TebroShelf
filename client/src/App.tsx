// client/src/App.tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, ProtectedRoute, LoginPage } from "@/features/auth";
import { WebSocketProvider } from "@/shared/providers/WebSocketProvider";
import { Toaster } from "@/components/ui/toaster";
// import { LibraryPage } from '@/features/library/pages/LibraryPage';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <WebSocketProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                path="/*"
                element={
                  <ProtectedRoute>
                    {/* <LibraryPage /> */}
                    <div>Library placeholder - protected content</div>
                  </ProtectedRoute>
                }
              />
            </Routes>
          </BrowserRouter>
          <Toaster />
        </WebSocketProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
