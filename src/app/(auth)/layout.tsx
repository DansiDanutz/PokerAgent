import { Tagline } from "@/components/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <div className="flex-1" />
      {children}
      <div className="flex-1" />
      <div className="pt-8">
        <Tagline />
      </div>
    </div>
  );
}
