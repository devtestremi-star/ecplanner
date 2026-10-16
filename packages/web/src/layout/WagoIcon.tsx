import { SvgIcon, type SvgIconProps } from '@mui/material';

/** Rouge de la marque Wago. */
export const WAGO_RED = '#c1272d';

/**
 * Logo Wago, repris de https://addons.wago.io/images/wago-logo.svg.
 *
 * Les parties blanches suivent `currentColor` pour s'accorder au texte qui l'entoure ;
 * le quart rouge garde la couleur de la marque. Le logo est plus large que haut
 * (541,7 × 311,6) : la `viewBox` est carrée et le centre verticalement.
 */
export function WagoIcon(props: SvgIconProps) {
  return (
    <SvgIcon viewBox="0 -115 541.7 541.7" {...props}>
      <path d="M230.8,140.6h79.8a77.11,77.11,0,0,1,60.8-60.7V0A156.13,156.13,0,0,0,230.8,140.6Z" />
      <path fill={WAGO_RED} d="M461.9,140.6h79.8A156.13,156.13,0,0,0,401.1,0V79.8A77.1,77.1,0,0,1,461.9,140.6Z" />
      <path d="M310.7,170.9c0-.2.1-.4.1-.6h-80a1.27,1.27,0,0,0,.1.6,77.06,77.06,0,0,1-151.1-.6H0a156.24,156.24,0,0,0,271,90.3,155.38,155.38,0,0,0,100.6,50.3V231A76.93,76.93,0,0,1,310.7,170.9Z" />
      <path d="M401.1,231.1V311A156.13,156.13,0,0,0,541.7,170.4H461.9A77.11,77.11,0,0,1,401.1,231.1Z" />
    </SvgIcon>
  );
}
