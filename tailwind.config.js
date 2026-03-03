/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
  	extend: {
  		fontFamily: {
  			sans: ['Inter', 'system-ui', 'sans-serif'],
  			mono: ['JetBrains Mono', 'monospace'],
  			display: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)',
  			xl: 'var(--radius-xl)',
  			'2xl': '1rem',
  			'fintech': '20px',
  			'status': '3px',
  			'panel': '12px',
  			'input': '10px',
  		},
		boxShadow: {
			'elevation': '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
			'elevation-md': '0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -2px rgba(0,0,0,0.05)',
			'elevation-lg': '0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px -4px rgba(0,0,0,0.04)',
			'elevation-xl': '0 20px 25px -5px rgba(0,0,0,0.08), 0 8px 10px -6px rgba(0,0,0,0.04)',
			'sidebar': '4px 0 24px -4px rgba(0,0,0,0.15)',
			'glass': '0 8px 32px rgba(0,0,0,0.12)',
			'neon-blue': '0 0 20px rgba(0, 212, 255, 0.4)',
			'neon-purple': '0 0 20px rgba(168, 85, 247, 0.4)',
		},
		dropShadow: {
			'subtle': '0 1px 2px rgba(0, 0, 0, 0.08)',
		},
  		backgroundImage: {
  			'fintech-navy': 'linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #0f172a 100%)',
  			'fintech-navy-deep': 'linear-gradient(180deg, #020617 0%, #0f172a 50%, #1e293b 100%)',
  		},
  		colors: {
  			/* FinBank palette */
  			'bg-main': 'var(--bg-main)',
  			'bg-card': 'var(--bg-card)',
  			'brand-primary': 'var(--brand-primary)',
  			'brand-secondary': 'var(--brand-secondary)',
  			'accent-blue': 'var(--accent-blue)',
  			'status-paid': 'var(--status-paid)',
  			'status-overdue': 'var(--status-overdue)',
  			'status-pending': 'var(--status-pending)',
  			'text-main': 'var(--text-main)',
  			'text-muted': 'var(--text-muted)',
  			'logo-cyan': 'var(--logo-cyan)',
  			'neon-blue': '#00D4FF',
  			'neon-purple': '#A855F7',
  			'navy-900': '#0f172a',
  			'navy-800': '#1e293b',
  			'navy-950': '#020617',
  			'content-bg': 'var(--content-bg)',
  			'panel-bg': 'var(--panel-bg)',
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			}
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
}