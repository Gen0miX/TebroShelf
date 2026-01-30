// client/src/App.tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, ProtectedRoute, LoginPage } from "@/features/auth";
import { AdminRoute } from "@/features/auth/components/AdminRoute";
import { ScanButton } from "@/features/admin/components/ScanButton";
import { WebSocketProvider } from "@/shared/providers/WebSocketProvider";
import { Toaster } from "@/shared/components/ui/toaster";
import QuarantinePage from "@/shared/pages/QuarantinePage";
// import { LibraryPage } from '@/features/library/pages/LibraryPage';

import { MainLayout } from "@/shared/components/layout/MainLayout";

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
                    <MainLayout>
                      <Routes>
                        {/* Library Routes */}
                        <Route
                          path="/"
                          element={
                            <div className="flex flex-col gap-4">
                              <h2 className="text-2xl font-bold">Library</h2>
                              <p className="text-muted-foreground">
                                Library placeholder - protected content{" "}
                                <ScanButton />
                              </p>
                            </div>
                          }
                        />
                        <Route
                          path="/library/books"
                          element={<div>All Books Library</div>}
                        />
                        <Route
                          path="/library/manga"
                          element={<div>All Manga Library</div>}
                        />

                        {/* Quarantine Route */}
                        <Route
                          path="/quarantine"
                          element={
                            <AdminRoute>
                              <QuarantinePage />
                            </AdminRoute>
                          }
                        />

                        {/* Other placeholders */}
                        <Route
                          path="/add"
                          element={<div>Add New Content</div>}
                        />
                        <Route
                          path="/activity"
                          element={<div>Activity Feed</div>}
                        />
                        <Route path="/settings" element={<div>Settings</div>} />
                      </Routes>
                    </MainLayout>
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
