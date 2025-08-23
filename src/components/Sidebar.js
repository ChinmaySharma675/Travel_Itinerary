import React, { useState } from "react";
import { motion } from "framer-motion";

const Sidebar = ({ days, onSelectDay }) => {
    const [activeDay, setActiveDay] = useState(1);

    const handleClick = (day) => {
        setActiveDay(day);
        onSelectDay(day);
    };

    return (
        <div
            style={{
                width: "200px",
                background: "#1e1e2f",
                color: "#fff",
                padding: "20px",
                display: "flex",
                flexDirection: "column",
                position: "relative",
            }}
        >
            <h2 style={{ marginBottom: "20px" }}>Days</h2>
            {days.map((day) => (
                <div key={day.day} style={{ position: "relative", margin: "10px 0" }}>
                    {/* Animated background for active day */}
                    {activeDay === day.day && (
                        <motion.div
                            layoutId="activeDayHighlight"
                            style={{
                                position: "absolute",
                                top: 0,
                                left: 0,
                                width: "100%",
                                height: "100%",
                                backgroundColor: "#2a2a40",
                                borderRadius: "5px",
                                zIndex: 0,
                            }}
                            transition={{ type: "spring", stiffness: 500, damping: 30 }}
                        />
                    )}

                    <motion.button
                        onClick={() => handleClick(day.day)}
                        whileHover={{ scale: 1.05, backgroundColor: "#333355" }}
                        whileTap={{ scale: 0.95, backgroundColor: "#444466" }}
                        style={{
                            display: "block",
                            width: "100%",
                            padding: "10px",
                            background: "transparent",
                            color: "#fff",
                            border: "none",
                            cursor: "pointer",
                            borderRadius: "5px",
                            textAlign: "left",
                            position: "relative",
                            zIndex: 1,
                        }}
                    >
                        Day {day.day}
                    </motion.button>
                </div>
            ))}
        </div>
    );
};

export default Sidebar;
