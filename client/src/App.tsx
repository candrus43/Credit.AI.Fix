import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import ConnectCreditReport from "./pages/ConnectCreditReport";
import ReportReview from "./pages/ReportReview";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/connect" element={<ConnectCreditReport />} />
        <Route path="/reports/:id/review" element={<ReportReview />} />
      </Route>
    </Routes>
  );
}
