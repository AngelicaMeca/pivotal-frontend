"use client";

import { motion } from "framer-motion";
import Container from "./Container";
import SectionHeading from "./SectionHeading";
import Reveal, { staggerContainer, staggerItem } from "./Reveal";
import { marketSegments } from "@/lib/content";

export default function Market() {
  return (
    <section className="border-b border-cocoa/10 bg-cream py-24 md:py-32">
      <Container>
        <Reveal>
          <SectionHeading
            index="06"
            eyebrow="Mercado"
            title="Argentina primero, con expansión planificada por fases."
            description="Primero el ecosistema agroalimentario argentino, luego Latinoamérica, después el resto del mundo: el análisis agroalimentario exige una mirada sistémica, no compartimentos aislados por país."
          />
        </Reveal>

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
              <span className="font-mono text-xs tnum text-clay">
                {segment.index}
              </span>
              <h3 className="mt-4 text-xl font-semibold text-cocoa">
                {segment.name}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-olive">
                {segment.description}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </Container>
    </section>
  );
}
