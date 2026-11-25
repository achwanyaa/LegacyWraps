import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router';
import { Home } from './pages/Home';

// Heavy routes are split out: three.js only ships with the Studio, the admin ships separately.
const Studio = lazy(() => import('./pages/Studio'));
const Track = lazy(() => import('./pages/Track'));
const Admin = lazy(() => import('./pages/admin/Admin'));

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

const Loading = () => (
  <div className="page-loading">
    <div className="spinner" />
  </div>
);

export function App() {
  return (
    <BrowserRouter>
      <ScrollTop />
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/studio" element={<Studio />} />
          <Route path="/track" element={<Track />} />
          <Route path="/track/:code" element={<Track />} />
          <Route path="/admin/*" element={<Admin />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
