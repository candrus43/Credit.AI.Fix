import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import ConnectCreditReport from "./pages/ConnectCreditReport";
import MappingAdmin from "./pages/MappingAdmin";
import ReportReview from "./pages/ReportReview";
import ManualEntry from "./pages/ManualEntry";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/connect" element={<ConnectCreditReport />} />
        <Route path="/admin/mappings" element={<MappingAdmin />} />
        <Route path="/reports/:id/review" element={<ReportReview />} />
        <Route path="/reports/manual" element={<ManualEntry />} />
      </Route>
    </Routes>
  );
}
