import { BrowserRouter, Route, Routes } from "react-router-dom";
import { App } from "./App";
import { ProductPage } from "./pages/ProductPage";
import { ShopSuccessPage } from "./pages/ShopSuccessPage";

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/shop/success" element={<ShopSuccessPage />} />
        <Route path="/shop/:productSlug" element={<ProductPage />} />
      </Routes>
    </BrowserRouter>
  );
}
