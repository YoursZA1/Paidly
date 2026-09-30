import PropTypes from "prop-types";
import { useContext, useLayoutEffect, useRef } from "react";
import { UNSAFE_LocationContext as LocationContext } from "react-router-dom";
import { useIsPresent } from "framer-motion";

/**
 * Wrap the routed content of an AnimatePresence-keyed page with this.
 *
 * AnimatePresence keeps rendering the exiting page's element until its exit animation ends. That
 * element holds <Routes>, which reads the live router location — so without this, every navigation
 * rendered and committed the *destination* page inside the exiting wrapper, then mounted it a second
 * time once the exit finished. The exiting page keeps the location it was showing; the present page
 * gets the live context value unchanged.
 */
export default function PresenceLocationScope({ children }) {
  const liveLocation = useContext(LocationContext);
  const isPresent = useIsPresent();
  const lastPresentLocationRef = useRef(liveLocation);
  useLayoutEffect(() => {
    if (isPresent) lastPresentLocationRef.current = liveLocation;
  }, [isPresent, liveLocation]);
  return (
    <LocationContext.Provider value={isPresent ? liveLocation : lastPresentLocationRef.current}>
      {children}
    </LocationContext.Provider>
  );
}

PresenceLocationScope.propTypes = {
  children: PropTypes.node,
};
