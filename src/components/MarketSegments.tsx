"use client";

import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "./Reveal";
import { marketSegments } from "@/lib/content";

export default function MarketSegments() {
  return (
    <motion.div
      className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-2"
      variants={staggerContainer}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
    >
      {marketSegments.map((segment) => (
        <motion.div
          key={segment.index}
          variants={staggerItem}
          whileHover={{ y: -6 }}
          transition={{ type: "spring", stiffness: 300, damping: 22 }}
          className="rounded-[28px] border border-clay/20 bg-clay/[0.05] p-8 backdrop-blur-md hover:border-clay/30 hover:bg-clay/[0.08]"
        >
          <span className="font-mono text-xs tnum text-clay">{segment.index}</span>
          <h3 className="mt-4 text-xl font-semibold text-cocoa">{segment.name}</h3>
          <p className="mt-3 text-sm leading-relaxed text-olive">{segment.description}</p>
        </motion.div>
      ))}
    </motion.div>
  );
}
