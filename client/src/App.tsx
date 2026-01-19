import { Routes, Route } from "react-router-dom";
import { Button } from "@/components/ui/button";

function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background">
      <h1 className="text-4xl font-bold mb-4">TebroShelf</h1>
      <Button onClick={() => alert("Welcome!")}>Get Started</Button>
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
    </Routes>
  );
}

export default App;
