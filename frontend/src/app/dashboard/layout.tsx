import { TopNavbar } from "@components/TopNavbar";
import { Sidebar } from "@components/Sidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dashboard-shell flex min-h-screen w-full">
      <Sidebar />
      <main className="min-h-screen flex-1 lg:pl-80">
        <div className="px-4 py-4 md:px-6 md:py-6 xl:px-8">
          <TopNavbar />
          <div className="mt-6">{children}</div>
        </div>
      </main>
    </div>
  );
}
