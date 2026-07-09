import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Logo de Preciosos: isotipo de cabeza de oso (silueta geométrica al estilo
 * Mickey: un círculo grande de cabeza + dos orejas circulares al 35% del
 * diámetro, superpuestas a la cabeza, más una leve elipse inferior de hocico;
 * todo un único path con fill="currentColor") y, opcionalmente, el nombre
 * "Preciosos" en Fraunces 600.
 *
 * El host define color: var(--ion-color-primary), así que el oso hereda el
 * verde de marca y se puede recolorear por CSS. `size` controla el tamaño
 * del isotipo; el texto escala proporcionalmente vía --logo-size.
 */
@Component({
  selector: 'app-logo',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[style.--logo-size]': 'size() + "px"' },
  template: `
    <svg
      viewBox="0 0 100 100"
      fill="currentColor"
      role="img"
      aria-label="Preciosos"
      focusable="false">
      <path d="M14 26a12 12 0 1 0 24 0 12 12 0 1 0 -24 0Z
               M62 26a12 12 0 1 0 24 0 12 12 0 1 0 -24 0Z
               M16 50a34 34 0 1 0 68 0 34 34 0 1 0 -68 0Z
               M32 77a18 10 0 1 0 36 0 18 10 0 1 0 -36 0Z" />
    </svg>
    @if (withText()) {
      <span class="logo-text">Preciosos</span>
    }
  `,
  styles: [`
    :host {
      display: inline-flex;
      align-items: center;
      gap: calc(var(--logo-size) * 0.24);
      color: var(--ion-color-primary);
      line-height: 1;
      vertical-align: middle;
    }

    svg {
      display: block;
      width: var(--logo-size);
      height: var(--logo-size);
      flex-shrink: 0;
    }

    .logo-text {
      font-family: var(--app-font-serif);
      font-weight: 600;
      font-size: calc(var(--logo-size) * 0.8);
      color: var(--app-ink);
      letter-spacing: -0.01em;
      white-space: nowrap;
    }
  `],
})
export class LogoComponent {
  /** Tamaño del isotipo en px */
  size = input(28);
  /** Muestra "Preciosos" en Fraunces 600 al lado del isotipo */
  withText = input(false);
}
