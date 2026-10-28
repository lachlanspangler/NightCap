// QR codes for joining a night (pure JS generator → SVG). Error correction M; quiet zone of 2.
import qrcode from "qrcode-generator";
import { useMemo } from "react";
import Svg, { Rect } from "react-native-svg";

export function QR({
  value,
  size,
  color = "#0C0A14",
  background = "#F7EFE2",
}: {
  value: string;
  size: number;
  color?: string;
  background?: string;
}) {
  const { n, cells } = useMemo(() => {
    const q = qrcode(0, "M");
    q.addData(value);
    q.make();
    const count = q.getModuleCount();
    const out: [number, number][] = [];
    for (let r = 0; r < count; r++) for (let c = 0; c < count; c++) if (q.isDark(r, c)) out.push([r, c]);
    return { n: count, cells: out };
  }, [value]);
  const quiet = 2;
  const total = n + quiet * 2;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${total} ${total}`} accessibilityLabel="QR code to join">
      <Rect x={0} y={0} width={total} height={total} fill={background} rx={2} />
      {cells.map(([r, c]) => (
        <Rect key={`${r}-${c}`} x={c + quiet} y={r + quiet} width={1.02} height={1.02} fill={color} />
      ))}
    </Svg>
  );
}
