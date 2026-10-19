import { StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, Ellipse, G, Path, RadialGradient, Stop } from "react-native-svg";

/**
 * The top of the planet from the site's home page: a dark sphere lit from
 * the upper left, a teal rim, a wireframe, and two transfers arcing over it,
 * one flagged. Drawn, not animated; it is a header, and a phone screen that
 * moves under someone's thumb all day becomes noise.
 *
 * Dark on both themes, like the one on the site.
 */
export default function Planet({ height = 150, live = true }: { height?: number; live?: boolean }) {
  return (
    <View style={[styles.wrap, { height }]} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="40 60 520 260" preserveAspectRatio="xMidYMax slice">
        <Defs>
          <RadialGradient id="body" cx="36%" cy="26%" r="80%">
            <Stop offset="0" stopColor="#1D3B37" />
            <Stop offset="0.45" stopColor="#14110F" />
            <Stop offset="1" stopColor="#0B0A09" />
          </RadialGradient>
          <RadialGradient id="glow" cx="50%" cy="100%" r="70%">
            <Stop offset="0" stopColor="#0F9B8E" stopOpacity="0.45" />
            <Stop offset="1" stopColor="#0F9B8E" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle cx="300" cy="320" r="300" fill="url(#glow)" />
        <Circle cx="300" cy="300" r="231" fill="url(#body)" />
        <Circle cx="300" cy="300" r="231" fill="none" stroke="rgba(45,212,191,0.55)" strokeWidth={1.6} />
        <G fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth={1}>
          <Ellipse cx="300" cy="226.9" rx="216.1" ry="80.2" />
          <Ellipse cx="300" cy="162.7" rx="176.2" ry="65.4" />
          <Ellipse cx="300" cy="115" rx="115" ry="42.7" />
          <Ellipse cx="300" cy="300" rx="120" ry="214" />
          <Ellipse cx="300" cy="300" rx="200" ry="214" />
          <Ellipse cx="300" cy="300" rx="40" ry="214" />
        </G>
        <G fill="rgba(255,255,255,0.6)">
          {[[444, 124, 2], [248, 231, 3], [274, 98, 2.4], [253, 107, 2.3], [217, 176, 2.7], [340, 246, 3],
            [381, 87, 2], [317, 225, 3], [228, 161, 2.7], [425, 169, 2.5], [170, 262, 2.8], [206, 110, 2.1],
            [390, 219, 2.9]].map(([x, y, r]) => <Circle key={`${x}-${y}`} cx={x} cy={y} r={r} />)}
        </G>
        {live && (
          <G fill="none" strokeWidth={2.4} strokeLinecap="round">
            <Path d="M473,253.4 Q394.3,61 228.1,160.6" stroke="#2DD4BF" strokeDasharray="6 9" />
            <Path d="M486.1,304 Q459.3,65 299.4,102.3" stroke="#FF6B6B" strokeDasharray="6 9" />
            <Circle cx="299.4" cy="102.3" r={6} fill="#FF6B6B" />
          </G>
        )}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: "#0B0A09", overflow: "hidden" },
});
