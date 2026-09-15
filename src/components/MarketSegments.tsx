"use client";

import { motion } from "framer-motion";
import GlassSurface from "./GlassSurface";
import { BuildingIcon, SproutIcon } from "./icons";
import { staggerContainer, staggerItem } from "./Reveal";
import { marketSegments } from "@/lib/content";

const ICONS = [BuildingIcon, SproutIcon];

export default function MarketSegments() {
  return (
    <div className="mt-16">
      <motion.div
        className="grid grid-cols-1 gap-6 md:grid-cols-2"
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
            className="h-full"
          >
            {/* Glass refracting the blobs; the cream frost keeps the copy at
                contrast wherever a blob passes behind */}
            <GlassSurface
              width="100%"
              height="100%"
              borderRadius={28}
              backgroundOpacity={0.35}
              saturation={1.2}
              brightness={55}
              opacity={0.9}
              blur={11}
              displace={0.5}
              distortionScale={-160}
              contentClassName="p-8"
            >
              <div className="flex items-start justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-olive/20 text-cocoa">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="font-mono text-xs tnum text-cocoa/80">{segment.index}</span>
              </div>
              <h3 className="mt-6 text-xl font-semibold text-cocoa">{segment.name}</h3>
              <p className="mt-3 text-sm leading-relaxed text-cocoa/80">{segment.description}</p>
            </GlassSurface>
          </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
