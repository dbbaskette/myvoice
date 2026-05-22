import { useParams } from "react-router-dom";

export function PackDetailPage(): JSX.Element {
  const { slug } = useParams();
  return (
    <div className="p-8 text-slate-300">
      <h1 className="text-xl font-semibold text-slate-100">{slug}</h1>
      <p className="mt-2 text-sm text-slate-400">Pack detail UI lands in P3-T7.</p>
    </div>
  );
}
