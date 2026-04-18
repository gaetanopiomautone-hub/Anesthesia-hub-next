import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppLayout from "@/components/AppLayout";
import Dashboard from "@/pages/Dashboard";
import CalendarioTurni from "@/pages/CalendarioTurni";
import Ferie from "@/pages/Ferie";
import ImpegniUniversitari from "@/pages/ImpegniUniversitari";
import Logbook from "@/pages/Logbook";
import ArchivioDidattico from "@/pages/ArchivioDidattico";
import Report from "@/pages/Report";
import Login from "@/pages/Login";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/turni" element={<CalendarioTurni />} />
            <Route path="/ferie" element={<Ferie />} />
            <Route path="/universita" element={<ImpegniUniversitari />} />
            <Route path="/logbook" element={<Logbook />} />
            <Route path="/archivio" element={<ArchivioDidattico />} />
            <Route path="/report" element={<Report />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
