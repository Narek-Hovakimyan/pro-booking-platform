import { cloneElement } from "react";

export default function BookingInfoRow({ icon, value, className = "" }) {
  return (
    <p className={`flex items-center gap-2 ${className}`}>
      {icon && cloneElement(icon, { className: "h-4 w-4 shrink-0" })}
      {value}
    </p>
  );
}
