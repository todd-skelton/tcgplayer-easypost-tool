import { Link, Container } from "@mui/material";
import { Link as RemixLink } from "@remix-run/react";

export default function HowToUse() {
  return (
    <Container>
      <Link component={RemixLink} to="/">
        Go back home
      </Link>
      <img src="/how-to-use.gif" alt="How to use" />
    </Container>
  );
}
