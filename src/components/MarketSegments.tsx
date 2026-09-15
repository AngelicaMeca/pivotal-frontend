"use client";

import { motion } from "framer-motion";
import { BuildingIcon, SproutIcon } from "./icons";
import { staggerContainer, staggerItem } from "./Reveal";
import { marketSegments } from "@/lib/content";

const ICONS = [BuildingIcon, SproutIcon];

// Flat cards, one palette colour each: clay for the public sector and olive
// for the private agro sector, both with cream copy. Olive is used as is: any
// lift toward cream would lower the contrast of the cream text further.
const TONES = ["bg-clay", "bg-olive"];

export default function MarketSegments() {
  return (
    <motion.div
      className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-2"
      variants={staggerContainer}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
    >
      {marketSegments.map((segment, i) => {
        const Icon = ICONS[i % ICONS.length];
        return (
          <motion.div
            key={segment.index}
            variants={staggerItem}
            whileHover={{ y: -6 }}
            transition={{ type: "spring", stiffness: 300, damping: 22 }}
            className={`h-full rounded-[28px] p-8 text-cream ${TONES[i % TONES.length]}`}
          >
            <div className="flex items-start justify-between">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-cocoa/15">
                <Icon className="h-5 w-5" />
              </span>
              <span className="font-mono text-xs tnum">{segment.index}</span>
            </div>
            <h3 className="mt-6 text-xl font-semibold">{segment.name}</h3>
            <p className="mt-3 text-sm leading-relaxed">{segment.description}</p>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
