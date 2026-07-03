import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import QAScan from './pages/QAScan'
import TestRunner from './pages/TestRunner'
import { LoadTest, UnicornSuite, Pagination, International, AIFeatures, UserBaseline, Automation, Lighthouse, MobileTesting, Reports, AllScans, History as ScanHistory } from './pages/pages'
import { AIRanking } from './pages/AIRanking' 

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index             element={<QAScan />} />
          <Route path="load"       element={<LoadTest />} />
          <Route path="unicorn"    element={<UnicornSuite />} />
          <Route path="pagination" element={<Pagination />} />
          <Route path="intl"       element={<International />} />
          <Route path="ai"         element={<AIFeatures />} />
          <Route path="baseline"   element={<UserBaseline />} />
          <Route path="automation" element={<Automation />} />
          <Route path="lighthouse" element={<Lighthouse />} />
          <Route path="mobile"     element={<MobileTesting />} />
          <Route path="test-runner" element={<TestRunner />} />
          <Route path="reports"    element={<Reports />} />
          <Route path="dashboard"  element={<AllScans />} />
          <Route path="history"     element={<ScanHistory />} />
          <Route path="ai-ranking"  element={<AIRanking />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
