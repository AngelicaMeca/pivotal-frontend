import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import Marquee from "@/components/Marquee";
import AttributeStrip from "@/components/AttributeStrip";
import About from "@/components/About";
import Product from "@/components/Product";
import PinUntilCovered from "@/components/PinUntilCovered";
import Provincia from "@/components/Provincia";
import Technologies from "@/components/Technologies";
import ValueProp from "@/components/ValueProp";
import Market from "@/components/Market";
import Mission from "@/components/Mission";
import Contact from "@/components/Contact";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Nav />
      <main className="flex-1">
        <Hero />
        <Marquee />
        <AttributeStrip />
        {/* Each wrapper is the range a pin holds for: About stays put while
            the product card rises over it and opens, then that whole block
            stays put, fully covered by the open card, while the Provincia
            card rises over it in turn. */}
        <div className="relative">
          {/* A pinned section is its own stacking context, so the block's
              z-index sits here. Provincia (z-30, later) still paints over it. */}
          <PinUntilCovered className="z-30" dimWhenCovered>
            <div className="relative">
              <PinUntilCovered>
                <About />
              </PinUntilCovered>
              <Product />
            </div>
          </PinUntilCovered>
          <Provincia />
        </div>
        <Technologies />
        <ValueProp />
        <Market />
        <Mission />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
