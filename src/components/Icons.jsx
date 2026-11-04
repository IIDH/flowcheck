const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }

const make = (paths) =>
  function Icon({ size = 18, className, ...rest }) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true" {...base} {...rest}>
        {paths}
      </svg>
    )
  }

export const IconLogo = make(<><path d="M6.4 18.4V5.6h7.9M6.4 11.6H12" strokeWidth="2.6" /><path d="m13.5 15.7 1.9 1.9 3.8-4.5" strokeWidth="2.1" /></>)
export const IconHome = make(<><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-6h4v6" /></>)
export const IconCalendar = make(<><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></>)
export const IconList = make(<><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="3.5" cy="6" r="1" /><circle cx="3.5" cy="12" r="1" /><circle cx="3.5" cy="18" r="1" /></>)
export const IconWallet = make(<><path d="M20 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-2" /><path d="M21 8h-6a4 4 0 0 0 0 8h6z" /><circle cx="15.5" cy="12" r=".6" fill="currentColor" /></>)
export const IconSun = make(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>)
export const IconMoon = make(<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />)
export const IconGear = make(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>)
export const IconLogout = make(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></>)
export const IconPlus = make(<path d="M12 5v14M5 12h14" />)
export const IconArrow = make(<path d="M5 12h14m-6-6 6 6-6 6" />)
export const IconChevL = make(<path d="m15 18-6-6 6-6" />)
export const IconChevR = make(<path d="m9 18 6-6-6-6" />)
export const IconTrash = make(<><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></>)
export const IconCheck = make(<path d="M20 6 9 17l-5-5" />)
export const IconAlert = make(<><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>)
export const IconInfo = make(<><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></>)
export const IconTrend = make(<><path d="m22 7-8.5 8.5-5-5L2 17" /><path d="M16 7h6v6" /></>)
export const IconPiggy = make(<><path d="M19 9.5c1 .5 2 1.6 2 3.5h-2c-.4 1.4-1.3 2.6-2.5 3.4V19h-3v-1.6a8 8 0 0 1-3 0V19h-3v-2.6A6 6 0 0 1 4 11.5C4 8 7.1 5.5 11 5.5c1.6 0 3 .4 4.2 1L18 5v3.3c.4.4.7.8 1 1.2z" /><circle cx="15" cy="10.5" r=".6" fill="currentColor" /></>)
export const IconCoins = make(<><ellipse cx="9" cy="7" rx="6" ry="3" /><path d="M3 7v5c0 1.7 2.7 3 6 3s6-1.3 6-3V7" /><path d="M9 15v2c0 1.7 2.7 3 6 3s6-1.3 6-3v-5c0-1.7-2.7-3-6-3" /></>)
export const IconLock = make(<><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>)
export const IconEdit = make(<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z" /></>)
export const IconDownload = make(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5M12 15V3" /></>)
export const IconX = make(<path d="M18 6 6 18M6 6l12 12" />)
export const IconMenu = make(<><circle cx="5" cy="12" r="1.4" fill="currentColor" /><circle cx="12" cy="12" r="1.4" fill="currentColor" /><circle cx="19" cy="12" r="1.4" fill="currentColor" /></>)
