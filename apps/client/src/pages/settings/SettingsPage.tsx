import { useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { BrandsTab } from './job/BrandsTab.js';
import { CommissionApprovalsTab } from './job/CommissionApprovalsTab.js';
import { ServiceChargesTab } from './job/ServiceChargesTab.js';
import { BackupSettingsSection } from './sections/BackupSettingsSection.js';
import { DiscountsSettingsSection } from './sections/DiscountsSettingsSection.js';
import { InvoiceReceiptsSettingsSection } from './sections/InvoiceReceiptsSettingsSection.js';
import { ShopSettingsSection } from './sections/ShopSettingsSection.js';
import { SettingsDirtyContext } from './SettingsDirtyContext.js';
import { SettingsNav } from './SettingsNav.js';
import { SettingsSectionFrame } from './SettingsSectionFrame.js';

/**
 * P16-1b — Settings shell redesign (owner decision OD-16-11, replaces the
 * P16-1 stacked-cards + Job Settings tile design). Page title + subtitle,
 * one panel split into a grouped left sub-nav (SettingsNav) and a routed
 * right content pane. Each section is its own `/settings/*` route so
 * browser back and deep links work — see main.tsx for the HashRouter this
 * relies on. `tab === 'settings'` in App.tsx is unchanged; only this
 * component's internals changed from a flat card stack to routes.
 */
export function SettingsPage(): React.JSX.Element {
  const [dirty, setDirty] = useState(false);

  return (
    <SettingsDirtyContext.Provider value={{ dirty, setDirty }}>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-semibold text-ink">Settings</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Manage shop identity, jobs, discounts, and backups.
          </p>
        </div>
        <div className="flex overflow-hidden rounded-lg border border-line bg-surface shadow-sm">
          <SettingsNav />
          <Routes>
            <Route path="/settings" element={<Navigate to="/settings/shop" replace />} />
            <Route
              path="/settings/shop"
              element={
                <SettingsSectionFrame
                  title="Shop"
                  description="Basic information shown on receipts and throughout the system."
                >
                  <ShopSettingsSection />
                </SettingsSectionFrame>
              }
            />
            <Route
              path="/settings/invoices"
              element={
                <SettingsSectionFrame
                  title="Invoices & Receipts"
                  description="Header, footer, and paper size for printed documents."
                >
                  <InvoiceReceiptsSettingsSection />
                </SettingsSectionFrame>
              }
            />
            <Route
              path="/settings/sales/discounts"
              element={
                <SettingsSectionFrame
                  title="Discounts"
                  description="Owner-configured discount presets and eligibility."
                >
                  <DiscountsSettingsSection />
                </SettingsSectionFrame>
              }
            />
            <Route
              path="/settings/jobs/service-charges"
              element={
                <SettingsSectionFrame
                  title="Service Charges"
                  description="Labour charges available at job delivery, and their commission."
                  wide
                >
                  <ServiceChargesTab />
                </SettingsSectionFrame>
              }
            />
            <Route
              path="/settings/jobs/brands"
              element={
                <SettingsSectionFrame
                  title="Brands"
                  description="Appliance brands offered at job intake."
                >
                  <BrandsTab />
                </SettingsSectionFrame>
              }
            />
            <Route
              path="/settings/jobs/commission-approvals"
              element={
                <SettingsSectionFrame
                  title="Commission Approvals"
                  description="Review and approve or reject pending commission claims."
                >
                  <CommissionApprovalsTab />
                </SettingsSectionFrame>
              }
            />
            <Route
              path="/settings/backup"
              element={
                <SettingsSectionFrame
                  title="Backup & Restore"
                  description="Export the database, or restore from a previous backup."
                >
                  <BackupSettingsSection />
                </SettingsSectionFrame>
              }
            />
          </Routes>
        </div>
      </div>
    </SettingsDirtyContext.Provider>
  );
}
