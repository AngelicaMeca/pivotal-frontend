"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Button from "./Button";
import { ChevronIcon } from "./icons";

const links = [
  { href: "/#tecnologia", label: "Tecnología" },
  { href: "/#provincia", label: "Provincia" },
  { href: "/nosotros", label: "Nosotros" },
];

const productItems = [
  {
    href: "/#producto",
    name: "B³ AgriFood",
    description: "El sistema de inteligencia para el agro argentino.",
  },
  {
    href: "/#provincia",
    name: "B³ AgriFood Provincia",
    description: "La infraestructura de datos gestionada para el Estado.",
  },
];

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [productsOpen, setProductsOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const openProducts = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setProductsOpen(true);
  };

  const closeProducts = () => {
    closeTimer.current = setTimeout(() => setProductsOpen(false), 120);
  };

  return (
    <motion.header
      animate={{ top: scrolled ? 12 : 20 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-x-4 z-50 mx-auto max-w-[1400px] rounded-[28px] border border-cream/10 bg-cocoa/95 shadow-[0_10px_40px_-12px_rgba(43,28,24,0.55)] backdrop-blur-xl sm:inset-x-6 lg:inset-x-10"
    >
      {/* The bar is as wide as the page content and ends right after its last
          control: the demo button from md up, the menu toggle below */}
      <motion.div
        animate={{ height: scrolled ? 56 : 68 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="flex w-full items-center justify-between pl-5 pr-3.5 sm:pl-7 md:pr-2"
      >
        <Link
          href="/"
          className="font-mono text-sm font-medium uppercase tracking-[0.25em] text-cream"
          onClick={() => setOpen(false)}
        >
          Pivotal
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          <div
            className="relative"
            onMouseEnter={openProducts}
            onMouseLeave={closeProducts}
          >
            <button
              type="button"
              aria-expanded={productsOpen}
              onClick={() => setProductsOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-full px-4 py-2 font-mono text-xs uppercase tracking-[0.15em] text-cream/70 transition-colors duration-150 hover:bg-cream/10 hover:text-cream"
            >
              Producto
              <ChevronIcon
                className={`h-3.5 w-3.5 transition-transform duration-200 ${
                  productsOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            <AnimatePresence>
              {productsOpen ? (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.98 }}
                  transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute left-0 top-full mt-3 w-80 rounded-2xl border border-clay/20 bg-cream p-2 shadow-[0_20px_50px_-15px_rgba(43,28,24,0.4)]"
                >
                  {productItems.map((item) => (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => setProductsOpen(false)}
                      className="block rounded-xl px-4 py-3 transition-colors duration-150 hover:bg-clay/10"
                    >
                      <div className="text-sm font-semibold text-cocoa">
                        {item.name}
                      </div>
                      <div className="mt-1 text-xs leading-relaxed text-olive">
                        {item.description}
                      </div>
                    </Link>
                  ))}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full px-4 py-2 font-mono text-xs uppercase tracking-[0.15em] text-cream/70 transition-colors duration-150 hover:bg-cream/10 hover:text-cream"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden sm:block">
            <Button href="/#contacto" variant="solid-light" withArrow>
              Solicitar demo
            </Button>
          </div>

          <button
            type="button"
            aria-label={open ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="relative h-10 w-10 shrink-0 rounded-full border border-cream/20 md:hidden"
          >
            <span
              className={`absolute left-1/2 top-1/2 h-px w-5 -translate-x-1/2 bg-cream transition-transform duration-200 ${
                open ? "rotate-45" : "-translate-y-[4px]"
              }`}
            />
            <span
              className={`absolute left-1/2 top-1/2 h-px w-5 -translate-x-1/2 bg-cream transition-transform duration-200 ${
                open ? "-rotate-45" : "translate-y-[4px]"
              }`}
            />
          </button>
        </div>
      </motion.div>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.nav key="mobile-menu" className="overflow-hidden md:hidden">
            <motion.div
              initial="hidden"
              animate="show"
              exit="hidden"
              variants={{
                hidden: {},
                show: { transition: { staggerChildren: 0.06 } },
              }}
              className="flex flex-col gap-1 px-5 pb-6 pt-2"
            >
              {[{ href: "/#producto", label: "Producto" }, ...links].map((link) => (
                <motion.a
                  key={link.href}
                  variants={{
                    hidden: { opacity: 0, x: -8 },
                    show: { opacity: 1, x: 0 },
                  }}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="rounded-xl px-4 py-3 font-mono text-sm uppercase tracking-[0.15em] text-cream/80 transition-colors duration-150 hover:bg-cream/10 hover:text-cream"
                >
                  {link.label}
                </motion.a>
              ))}
              <motion.div
                variants={{
                  hidden: { opacity: 0, x: -8 },
                  show: { opacity: 1, x: 0 },
                }}
                className="mt-2"
              >
                <Button href="/#contacto" variant="solid-light" withArrow>
                  Solicitar demo
                </Button>
              </motion.div>
            </motion.div>
          </motion.nav>
        ) : null}
      </AnimatePresence>
    </motion.header>
  );
}
